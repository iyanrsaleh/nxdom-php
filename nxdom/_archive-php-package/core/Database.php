<?php

namespace Nxdom\Core;

use PDO;

final class Database
{
    private PDO $pdo;

    public function __construct(private readonly AppContext $app)
    {
        $this->pdo = self::connect($app->database, $app->basePath);
    }

    private static function connect(array $config, string $basePath): PDO
    {
        $dsn = match ($config['driver']) {
            'sqlite' => 'sqlite:' . self::resolveSqlitePath($config['path'], $basePath),
            'mysql' => sprintf(
                'mysql:host=%s;port=%d;dbname=%s;charset=utf8mb4',
                $config['host'],
                $config['port'] ?? 3306,
                $config['name']
            ),
            'pgsql' => sprintf(
                'pgsql:host=%s;port=%d;dbname=%s',
                $config['host'],
                $config['port'] ?? 5432,
                $config['name']
            ),
            default => throw new \InvalidArgumentException("Driver database tidak dikenal: {$config['driver']}"),
        };

        $pdo = new PDO($dsn, $config['user'] ?? null, $config['password'] ?? null, [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        ]);

        if ($config['driver'] === 'sqlite') {
            $pdo->exec('PRAGMA foreign_keys = ON');
        }

        return $pdo;
    }

    private static function resolveSqlitePath(string $path, string $basePath): string
    {
        if (preg_match('#^([a-zA-Z]:[\\\\/]|/)#', $path)) {
            return $path;
        }

        $dir = dirname($basePath . DIRECTORY_SEPARATOR . $path);
        if (!is_dir($dir)) {
            mkdir($dir, 0777, true);
        }

        return $basePath . DIRECTORY_SEPARATOR . $path;
    }

    public function table(string $name): QueryBuilder
    {
        return new QueryBuilder($this->pdo, $name);
    }

    public function pdo(): PDO
    {
        return $this->pdo;
    }
}
