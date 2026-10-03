<?php
declare(strict_types=1);

namespace KocoUI\Controllers;

use KocoUI\Auth\LoginThrottle;
use KocoUI\Auth\Totp;
use KocoUI\Auth\Users;
use KocoUI\Config;
use KocoUI\Db;
use KocoUI\Http\HttpError;
use KocoUI\Http\Request;
use KocoUI\Http\Response;
use KocoUI\Session;

final class AuthController
{
    public static function me(Request $req): never
    {
        $user = self::currentUser();
        Response::json([
            'authenticated' => $user !== null,
            'user' => $user ? ['username' => $user['username']] : null,
            'csrf' => Session::csrf(),
        ]);
    }

    public static function login(Request $req): never
    {
        $username = trim($req->string('username', 64));
        $password = $req->string('password', 1024);
        $code = preg_replace('/\s+/', '', $req->string('code', 16));
        if ($username === '' || $password === '' || !preg_match('/^\d{6}$/', $code)) {
            throw new HttpError(400, 'invalid_input', 'Username, password and a 6-digit code are required');
        }

        $db = Db::pdo();
        $throttle = new LoginThrottle(
            $db,
            (int) Config::get('security.login_max_attempts', 5),
            (int) Config::get('security.login_window', 900),
        );
        $throttle->check($req->ip(), $username);

        $users = new Users($db);
        $user = $users->findByUsername($username);
        $passwordOk = Users::verifyPassword($password, $user['password_hash'] ?? null);
        $step = ($user && $passwordOk)
            ? Totp::verify($users->totpSecret($user), $code, (int) $user['totp_last_step'])
            : false;

        if ($step === false) {
            $throttle->record($req->ip(), $username, false);
            throw new HttpError(401, 'invalid_credentials', 'Invalid username, password or code');
        }

        $users->recordLogin((int) $user['id'], $step, Users::needsRehash($user['password_hash']) ? $password : null);
        $throttle->record($req->ip(), $username, true);
        Session::login((int) $user['id'], $user['username']);

        Response::json(['ok' => true, 'user' => ['username' => $user['username']], 'csrf' => Session::csrf()]);
    }

    public static function logout(Request $req): never
    {
        Session::reset();
        Response::json(['ok' => true, 'csrf' => Session::csrf()]);
    }

    public static function requireUser(): array
    {
        $user = self::currentUser();
        if ($user === null) {
            throw new HttpError(401, 'unauthenticated', 'Not logged in');
        }
        return $user;
    }

    private static function currentUser(): ?array
    {
        $id = Session::userId();
        return $id === null ? null : (new Users(Db::pdo()))->findById($id);
    }
}
