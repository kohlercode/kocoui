<?php
declare(strict_types=1);

namespace KocoUI;

final class Config
{
    private static ?array $data = null;

    public static function load(string $file): void
    {
        if (!is_file($file)) {
            throw new \RuntimeException('Missing config file ' . basename($file));
        }
        $data = require $file;
        if (!is_array($data)) {
            throw new \RuntimeException('Config file must return an array');
        }
        foreach (['base_url', 'hermes.base_url', 'hermes.api_key', 'security.secret'] as $key) {
            if ((string) self::dig($data, $key) === '') {
                throw new \RuntimeException("Config value '$key' is empty");
            }
        }
        if (!preg_match('/^[0-9a-f]{64}$/', (string) self::dig($data, 'security.secret'))) {
            throw new \RuntimeException("Config value 'security.secret' must be 64 hex characters");
        }
        self::$data = $data;
    }

    public static function get(string $key, mixed $default = null): mixed
    {
        if (self::$data === null) {
            throw new \LogicException('Config not loaded');
        }
        return self::dig(self::$data, $key) ?? $default;
    }

    private static function dig(array $data, string $key): mixed
    {
        foreach (explode('.', $key) as $part) {
            if (!is_array($data) || !array_key_exists($part, $data)) {
                return null;
            }
            $data = $data[$part];
        }
        return $data;
    }
}
