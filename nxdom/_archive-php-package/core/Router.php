<?php

namespace Nxdom\Core;

final class Router
{
    /**
     * Cocokkan (method, path) request terhadap daftar route manifest.
     * Mendukung path parameter bergaya :id (lihat contoh manifest demo).
     *
     * @param array $routes
     * @return array{route: array, params: array<string,string>}|null
     */
    public static function match(array $routes, string $method, string $path): ?array
    {
        $pathSegments = self::segments($path);

        foreach ($routes as $route) {
            if (strtoupper($route['method']) !== strtoupper($method)) {
                continue;
            }

            $routeSegments = self::segments($route['path']);
            if (count($routeSegments) !== count($pathSegments)) {
                continue;
            }

            $params = [];
            $isMatch = true;

            foreach ($routeSegments as $i => $routeSegment) {
                if (str_starts_with($routeSegment, ':')) {
                    $params[substr($routeSegment, 1)] = $pathSegments[$i];
                    continue;
                }
                if ($routeSegment !== $pathSegments[$i]) {
                    $isMatch = false;
                    break;
                }
            }

            if ($isMatch) {
                return ['route' => $route, 'params' => $params];
            }
        }

        return null;
    }

    private static function segments(string $path): array
    {
        return array_values(array_filter(explode('/', trim($path, '/')), fn ($s) => $s !== ''));
    }

    private const AUTH_ACTIONS = ['login', 'logout', 'register', 'me'];
    private const CRUD_ACTIONS = ['query', 'get', 'create', 'update', 'delete'];

    /**
     * M3/M4: dispatch data-driven — menginterpretasikan entri manifest
     * langsung menjadi operasi Database/Auth generik, tanpa handler
     * tertulis developer (lihat Plan.md Bagian 4).
     */
    public static function dispatch(AppContext $app, array $route, array $params): void
    {
        $db = new Database($app);
        $auth = new Auth($app, $db);

        if (($route['auth'] ?? false) === true && !$auth->isAuthenticated()) {
            Response::error(401, 'Autentikasi diperlukan');
            return;
        }

        if (in_array($route['action'], self::AUTH_ACTIONS, true)) {
            self::dispatchAuth($auth, $route);
            return;
        }

        if (!in_array($route['action'], self::CRUD_ACTIONS, true)) {
            Response::error(500, "Action tidak dikenal: {$route['action']}");
            return;
        }

        $table = $db->table($route['resource']);
        $constraints = $route['constraints'] ?? [];

        try {
            match ($route['action']) {
                'query' => self::handleQuery($table, $constraints),
                'get' => self::handleGet($table, $params, $route),
                'create' => self::handleCreate($table, $constraints),
                'update' => self::handleUpdate($table, $params, $route, $constraints),
                'delete' => self::handleDelete($table, $params, $route),
            };
        } catch (\InvalidArgumentException $e) {
            Response::error(400, $e->getMessage());
        } catch (\PDOException $e) {
            error_log('[nxdom] PDOException: ' . $e->getMessage());
            Response::error(500, 'Database error');
        }
    }

    private static function dispatchAuth(Auth $auth, array $route): void
    {
        try {
            match ($route['action']) {
                'register' => Response::created($auth->register(self::jsonBody())),
                'login' => Response::ok($auth->login(self::jsonBody())),
                'logout' => (function () use ($auth) {
                    $auth->logout();
                    Response::json(200, ['data' => ['loggedOut' => true]]);
                })(),
                'me' => self::respondMe($auth),
            };
        } catch (AuthException $e) {
            Response::error($e->status, $e->getMessage());
        } catch (\PDOException $e) {
            error_log('[nxdom] PDOException (auth): ' . $e->getMessage());
            Response::error(500, 'Database error');
        }
    }

    private static function respondMe(Auth $auth): void
    {
        $user = $auth->me();
        if ($user === null) {
            Response::error(401, 'Belum login');
            return;
        }
        Response::ok($user);
    }

    /**
     * M5: constraints manifest selalu diterapkan lebih dulu dan tidak bisa
     * di-override client (README pola nxdom.db().where().get() dari client
     * hanya BOLEH menambah, dalam batas whitelist allowClientWhere /
     * allowClientOrderBy / maxClientLimit). Lihat Plan.md Bagian 5 (M5) dan
     * manifest.schema.json untuk kontraknya.
     */
    private static function handleQuery(QueryBuilder $table, array $constraints): void
    {
        $table->applyConstraints($constraints);

        foreach (self::clientWhereFromQueryString() as [$column, $operator, $value]) {
            $allowed = $constraints['allowClientWhere'] ?? [];
            if (!in_array($column, $allowed, true)) {
                Response::error(403, "Kolom '$column' tidak diizinkan untuk where dari client");
                return;
            }
            $table->where($column, $operator, $value);
        }

        if ($clientOrderBy = $_GET['orderBy'] ?? null) {
            [$column, $direction] = array_pad(explode(':', $clientOrderBy, 2), 2, 'asc');
            $allowed = $constraints['allowClientOrderBy'] ?? [];
            if (!in_array($column, $allowed, true)) {
                Response::error(403, "Kolom '$column' tidak diizinkan untuk orderBy dari client");
                return;
            }
            $table->replaceOrderBy($column, $direction);
        }

        if ($clientLimit = $_GET['limit'] ?? null) {
            $max = $constraints['maxClientLimit'] ?? null;
            if ($max === null) {
                Response::error(403, 'limit dari client tidak diizinkan untuk route ini');
                return;
            }
            $table->limit(min((int) $clientLimit, $max));
        }

        Response::ok($table->get());
    }

    /**
     * Format query string: ?where=kolom:operator:nilai (bisa berulang).
     */
    private static function clientWhereFromQueryString(): array
    {
        $raw = $_GET['where'] ?? [];
        $raw = is_array($raw) ? $raw : [$raw];

        $result = [];
        foreach ($raw as $entry) {
            $parts = explode(':', $entry, 3);
            if (count($parts) !== 3) {
                continue;
            }
            [$column, $operator, $value] = $parts;
            $result[] = [$column, $operator, self::castQueryValue($value)];
        }

        return $result;
    }

    private static function castQueryValue(string $value): mixed
    {
        return match ($value) {
            'true' => true,
            'false' => false,
            default => is_numeric($value) ? $value + 0 : $value,
        };
    }

    private static function handleGet(QueryBuilder $table, array $params, array $route): void
    {
        $key = $route['params'][0] ?? 'id';
        $row = $table->find($params[$key]);

        if ($row === null) {
            Response::error(404, 'Data tidak ditemukan');
            return;
        }

        Response::ok($row);
    }

    private static function handleCreate(QueryBuilder $table, array $constraints): void
    {
        $body = self::jsonBody();
        $data = self::filterFillable($body, $constraints['fillable'] ?? null);

        if (!$data) {
            Response::error(400, 'Body kosong atau tidak ada field yang diizinkan (fillable)');
            return;
        }

        $id = $table->insert($data);
        Response::created(['id' => $id, ...$data]);
    }

    private static function handleUpdate(QueryBuilder $table, array $params, array $route, array $constraints): void
    {
        $key = $route['params'][0] ?? 'id';
        $body = self::jsonBody();
        $data = self::filterFillable($body, $constraints['fillable'] ?? null);

        if (!$data) {
            Response::error(400, 'Body kosong atau tidak ada field yang diizinkan (fillable)');
            return;
        }

        $affected = $table->where($key, '=', $params[$key])->update($data);

        if ($affected === 0) {
            Response::error(404, 'Data tidak ditemukan');
            return;
        }

        Response::ok(['id' => $params[$key], ...$data]);
    }

    private static function handleDelete(QueryBuilder $table, array $params, array $route): void
    {
        $key = $route['params'][0] ?? 'id';
        $affected = $table->where($key, '=', $params[$key])->delete();

        if ($affected === 0) {
            Response::error(404, 'Data tidak ditemukan');
            return;
        }

        Response::json(200, ['data' => ['deleted' => true]]);
    }

    private static function filterFillable(array $body, ?array $fillable): array
    {
        if ($fillable === null) {
            return $body;
        }
        return array_intersect_key($body, array_flip($fillable));
    }

    private static function jsonBody(): array
    {
        $raw = file_get_contents('php://input');
        $data = json_decode($raw, true);
        return is_array($data) ? $data : [];
    }
}
