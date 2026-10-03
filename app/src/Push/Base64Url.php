<?php
declare(strict_types=1);

namespace KocoUI\Push;

final class Base64Url
{
    public static function encode(string $raw): string
    {
        return rtrim(strtr(base64_encode($raw), '+/', '-_'), '=');
    }

    public static function decode(string $encoded): string
    {
        $raw = base64_decode(strtr($encoded, '-_', '+/'), true);
        if ($raw === false) {
            throw new \InvalidArgumentException('Invalid base64url');
        }
        return $raw;
    }
}
