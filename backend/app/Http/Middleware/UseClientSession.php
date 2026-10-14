<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class UseClientSession
{
    public function handle(Request $request, Closure $next): Response
    {
        $sessionManager = app('session');
        $sessionManager->forgetDrivers();
        $baseCookie = (string) config('session.cookie');
        $scope = $request->header('X-Workspace-Session');
        $cookieName = is_string($scope) &&
            preg_match('/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i', $scope) === 1
                ? $baseCookie.'_'.substr(hash('sha256', $scope), 0, 16)
                : $baseCookie;
        config(['session.cookie' => $cookieName]);

        try {
            return $next($request);
        } finally {
            $sessionManager->forgetDrivers();
            config(['session.cookie' => $baseCookie]);
        }
    }
}
