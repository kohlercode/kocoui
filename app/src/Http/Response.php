<?php
declare(strict_types=1);

namespace KocoUI\Http;

final class Response
{
    public static function json(mixed $data, int $status = 200): never
    {
        http_response_code($status);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode($data, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
        exit;
    }

    public static function error(HttpError $e): never
    {
        if ($e->status === 429 && isset($e->extra['retry_after'])) {
            header('Retry-After: ' . (int) $e->extra['retry_after']);
        }
        self::json(['error' => ['code' => $e->errorCode, 'message' => $e->getMessage()] + $e->extra], $e->status);
    }
}
