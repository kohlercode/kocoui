<?php
declare(strict_types=1);

namespace KocoUI\Http;

use KocoUI\Config;
use KocoUI\Session;

final class Csrf
{
    /** Every state-changing request needs the session token plus a same-origin browser context. */
    public static function verify(Request $req): void
    {
        $site = $req->header('Sec-Fetch-Site');
        if ($site !== null && $site !== 'same-origin') {
            throw new HttpError(403, 'csrf_failed', 'Cross-site request rejected');
        }
        $origin = $req->header('Origin');
        if ($origin !== null && rtrim($origin, '/') !== rtrim((string) Config::get('base_url'), '/')) {
            throw new HttpError(403, 'csrf_failed', 'Origin not allowed');
        }
        $token = $req->header('X-CSRF-Token');
        $expected = Session::csrf();
        if ($token === null || $expected === '' || !hash_equals($expected, $token)) {
            throw new HttpError(403, 'csrf_failed', 'Missing or invalid CSRF token');
        }
    }
}
