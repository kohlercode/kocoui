<?php
declare(strict_types=1);

namespace KocoUI\Http;

final class Router
{
    /** @var list<array{method:string, regex:string, handler:callable, opts:array}> */
    private array $routes = [];

    /**
     * @param string $pattern e.g. /api/runs/{id}; placeholders match one path segment
     * @param array{auth?:bool, session_write?:bool} $opts auth defaults to true, session_write to false
     */
    public function add(string $method, string $pattern, callable $handler, array $opts = []): void
    {
        $regex = preg_replace('#\\\{([a-z_]+)\\\}#', '(?P<$1>[A-Za-z0-9._:-]+)', preg_quote($pattern, '#'));
        $this->routes[] = ['method' => $method, 'regex' => '#^' . $regex . '$#', 'handler' => $handler, 'opts' => $opts];
    }

    /** @return array{0:callable, 1:array<string,string>, 2:array} */
    public function match(string $method, string $path): array
    {
        $allowed = [];
        foreach ($this->routes as $route) {
            if (!preg_match($route['regex'], $path, $m)) {
                continue;
            }
            if ($route['method'] !== $method && !($method === 'HEAD' && $route['method'] === 'GET')) {
                $allowed[] = $route['method'];
                continue;
            }
            $params = array_filter($m, 'is_string', ARRAY_FILTER_USE_KEY);
            return [$route['handler'], $params, $route['opts']];
        }
        if ($allowed) {
            header('Allow: ' . implode(', ', array_unique($allowed)));
            throw new HttpError(405, 'method_not_allowed', 'Method not allowed');
        }
        throw new HttpError(404, 'not_found', 'Not found');
    }
}
