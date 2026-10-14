<?php

/**
 * Autoloader minimal, tanpa Composer wajib (Plan.md Bagian 6: keputusan
 * terbuka soal strategi autoload — ini pilihan sementara untuk M1-M5).
 */
spl_autoload_register(function (string $class): void {
    $prefix = 'Nxdom\\Core\\';
    if (!str_starts_with($class, $prefix)) {
        return;
    }

    $relative = substr($class, strlen($prefix));
    $file = __DIR__ . '/core/' . str_replace('\\', '/', $relative) . '.php';

    if (is_file($file)) {
        require $file;
    }
});
