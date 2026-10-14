<?php

namespace Nxdom\Core;

final class Response
{
    public static function json(int $status, array $body): void
    {
        http_response_code($status);
        header('Content-Type: application/json');
        echo json_encode($body);
    }

    public static function ok(mixed $data): void
    {
        self::json(200, ['data' => $data]);
    }

    public static function created(mixed $data): void
    {
        self::json(201, ['data' => $data]);
    }

    public static function error(int $status, string $message): void
    {
        self::json($status, ['error' => $message]);
    }
}
