<?php

namespace Nxdom\Core;

final class AuthException extends \RuntimeException
{
    public function __construct(
        public readonly int $status,
        string $message
    ) {
        parent::__construct($message);
    }
}
