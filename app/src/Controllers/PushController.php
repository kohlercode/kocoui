<?php
declare(strict_types=1);

namespace KocoUI\Controllers;

use KocoUI\Http\HttpError;
use KocoUI\Http\Request;
use KocoUI\Http\Response;
use KocoUI\Push\Base64Url;
use KocoUI\Push\Notifier;
use KocoUI\Push\Subscriptions;
use KocoUI\Push\Vapid;
use KocoUI\Session;

final class PushController
{
    public static function status(Request $req): never
    {
        $uid = (int) Session::userId();
        Response::json([
            'enabled' => Notifier::enabled(),
            'vapid_public' => Notifier::enabled() ? Vapid::publicKey() : null,
            'subscription_count' => Subscriptions::countForUser($uid),
        ]);
    }

    public static function subscribe(Request $req): never
    {
        if (!Notifier::enabled()) {
            throw new HttpError(503, 'push_disabled', 'Web Push is not configured');
        }
        $json = $req->json();
        $endpoint = self::endpoint($json['endpoint'] ?? null);
        $keys = is_array($json['keys'] ?? null) ? $json['keys'] : [];
        $p256dh = self::key($keys['p256dh'] ?? null, 65, 'p256dh');
        $auth = self::key($keys['auth'] ?? null, 16, 'auth');
        $ua = $req->header('User-Agent') ?? '';
        Subscriptions::upsert((int) Session::userId(), $endpoint, $p256dh, $auth, $ua);
        Response::json(['ok' => true]);
    }

    public static function unsubscribe(Request $req): never
    {
        $endpoint = self::endpoint($req->json()['endpoint'] ?? null);
        Subscriptions::deleteForUser((int) Session::userId(), $endpoint);
        Response::json(['ok' => true]);
    }

    private static function endpoint(mixed $value): string
    {
        if (!is_string($value) || strlen($value) < 20 || strlen($value) > 2048) {
            throw new HttpError(400, 'invalid_push_endpoint', 'Invalid push endpoint');
        }
        if (!str_starts_with($value, 'https://') || filter_var($value, FILTER_VALIDATE_URL) === false) {
            throw new HttpError(400, 'invalid_push_endpoint', 'Invalid push endpoint');
        }
        return $value;
    }

    private static function key(mixed $value, int $rawLen, string $name): string
    {
        if (!is_string($value) || $value === '') {
            throw new HttpError(400, 'invalid_push_key', "Invalid $name");
        }
        try {
            $raw = Base64Url::decode($value);
        } catch (\InvalidArgumentException) {
            throw new HttpError(400, 'invalid_push_key', "Invalid $name");
        }
        if (strlen($raw) !== $rawLen) {
            throw new HttpError(400, 'invalid_push_key', "Invalid $name");
        }
        // Store as the browser sent it (base64url).
        return $value;
    }
}
