<?php

namespace Nxdom\Core;

final class AppContext
{
    public readonly string $id;
    public readonly string $basePath;
    public readonly array $database;
    public readonly array $auth;
    public readonly string $storagePath;

    public function __construct(string $basePath, array $config)
    {
        $this->basePath = $basePath;
        $this->id = $config['id'];
        $this->database = $config['database'];
        $this->auth = $config['auth'] ?? [];
        $this->storagePath = isset($config['storage']['path'])
            ? realpath($basePath) . DIRECTORY_SEPARATOR . $config['storage']['path']
            : $basePath . DIRECTORY_SEPARATOR . 'storage';
    }

    public static function fromDirectory(string $basePath): ?self
    {
        $configFile = rtrim($basePath, '/\\') . DIRECTORY_SEPARATOR . 'nxdom.config.json';
        if (!is_file($configFile)) {
            return null;
        }

        $config = json_decode(file_get_contents($configFile), true);
        if (!is_array($config) || json_last_error() !== JSON_ERROR_NONE) {
            return null;
        }

        return new self($basePath, $config);
    }

    public function manifestPath(): string
    {
        return $this->basePath . DIRECTORY_SEPARATOR . 'nxdom.manifest.json';
    }

    public function loadManifest(): array
    {
        $path = $this->manifestPath();
        if (!is_file($path)) {
            return ['version' => 1, 'routes' => []];
        }

        $manifest = json_decode(file_get_contents($path), true);
        return is_array($manifest) ? $manifest : ['version' => 1, 'routes' => []];
    }
}
