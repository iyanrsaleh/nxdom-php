<?php

namespace Nxdom\Core;

final class Auth
{
    public function __construct(
        private readonly AppContext $app,
        private readonly Database $db
    ) {
    }

    private function sessionKey(): string
    {
        return 'nxdom_user_id';
    }

    private function ensureSessionStarted(): void
    {
        if (session_status() === PHP_SESSION_ACTIVE) {
            return;
        }

        session_name('nxdom_' . $this->app->id);
        session_set_cookie_params(['httponly' => true, 'samesite' => 'Lax']);
        session_start();
    }

    public function register(array $body): array
    {
        $config = $this->requireAuthConfig();
        $table = $this->db->table($config['table']);

        $identifier = trim((string) ($body[$config['identifier']] ?? ''));
        $password = (string) ($body[$config['passwordColumn']] ?? '');

        if ($identifier === '' || $password === '') {
            throw new AuthException(400, "Field '{$config['identifier']}' dan '{$config['passwordColumn']}' wajib diisi");
        }

        if ($table->find($identifier, $config['identifier']) !== null) {
            throw new AuthException(409, "'{$config['identifier']}' sudah terdaftar");
        }

        $data = [
            $config['identifier'] => $identifier,
            $config['passwordColumn'] => password_hash($password, PASSWORD_DEFAULT),
        ];

        foreach ($config['registerFillable'] ?? [] as $field) {
            if (isset($body[$field])) {
                $data[$field] = $body[$field];
            }
        }

        $id = $table->insert($data);
        return ['id' => $id, $config['identifier'] => $identifier];
    }

    public function login(array $body): array
    {
        $config = $this->requireAuthConfig();
        $table = $this->db->table($config['table']);

        $identifier = trim((string) ($body[$config['identifier']] ?? ''));
        $password = (string) ($body[$config['passwordColumn']] ?? '');

        if ($identifier === '' || $password === '') {
            throw new AuthException(400, "Field '{$config['identifier']}' dan '{$config['passwordColumn']}' wajib diisi");
        }

        $user = $table->find($identifier, $config['identifier']);

        if ($user === null || !password_verify($password, $user[$config['passwordColumn']] ?? '')) {
            throw new AuthException(401, 'Kredensial tidak valid');
        }

        $this->ensureSessionStarted();
        session_regenerate_id(true);
        $_SESSION[$this->sessionKey()] = $user['id'];

        return $this->publicUser($user, $config);
    }

    public function logout(): void
    {
        $this->ensureSessionStarted();
        $_SESSION = [];
        session_destroy();
    }

    public function me(): ?array
    {
        $this->ensureSessionStarted();
        $userId = $_SESSION[$this->sessionKey()] ?? null;

        if ($userId === null) {
            return null;
        }

        $config = $this->requireAuthConfig();
        $user = $this->db->table($config['table'])->find($userId);

        return $user ? $this->publicUser($user, $config) : null;
    }

    /**
     * Dipakai Kernel untuk menegakkan route['auth'] === true (guard),
     * tanpa perlu memuat data user penuh.
     */
    public function isAuthenticated(): bool
    {
        $this->ensureSessionStarted();
        return isset($_SESSION[$this->sessionKey()]);
    }

    private function publicUser(array $user, array $config): array
    {
        unset($user[$config['passwordColumn']]);
        return $user;
    }

    private function requireAuthConfig(): array
    {
        $config = $this->app->auth;
        foreach (['table', 'identifier', 'passwordColumn'] as $key) {
            if (empty($config[$key])) {
                throw new AuthException(500, "Konfigurasi auth.$key belum diset di nxdom.config.json");
            }
        }
        return $config;
    }
}
