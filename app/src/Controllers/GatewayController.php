<?php
declare(strict_types=1);

namespace KocoUI\Controllers;

use KocoUI\Gateway;
use KocoUI\Http\Request;
use KocoUI\Http\Response;

/** Host actions that the chat slash commands need. */
final class GatewayController
{
    public static function status(Request $req): never
    {
        Response::json(Gateway::status());
    }

    public static function restart(Request $req): never
    {
        Response::json(Gateway::requestRestart());
    }
}
