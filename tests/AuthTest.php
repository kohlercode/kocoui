<?php
declare(strict_types=1);

use KocoUI\Auth\Users;
use KocoUI\Controllers\AuthController;
use KocoUI\Db;
use KocoUI\Http\HttpError;
use KocoUI\Http\Request;
use KocoUI\Push\Notifier;
use KocoUI\Push\Vapid;

return static function (): void {
    $db = Db::pdo();
    $users = new Users($db);
    $password = 'correct horse battery';
    if ($users->findByUsername('dana') === null) {
        $users->create('dana', $password, 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
    }
    $user = $users->findByUsername('dana');
    $db->prepare('UPDATE users SET totp_secret_enc = ? WHERE id = ?')->execute(['not-a-secret', $user['id']]);
    $req = Request::fake('POST', '/api/auth/login', [
        'username' => 'dana',
        'password' => $password,
        'code' => '000000',
    ], ['REMOTE_ADDR' => '203.0.113.77']);
    try {
        AuthController::login($req);
        TestCase::assertTrue(false, 'corrupt totp should not log in');
    } catch (HttpError $e) {
        TestCase::assertSame(401, $e->status, 'corrupt totp is invalid credentials');
        TestCase::assertSame('invalid_credentials', $e->errorCode, 'error code');
    }

    kocoui_write_config(['push' => [
        'vapid_subject' => 'mailto:admin@test.local',
        'vapid_public' => '!!!',
        'vapid_private' => '!!!',
    ]]);
    TestCase::assertFalse(Vapid::configured(), 'bad vapid is not configured');
    TestCase::assertFalse(Notifier::enabled(), 'push stays off so a run is not blocked');
    kocoui_write_config();
};
