<?php
declare(strict_types=1);

chdir(dirname(__DIR__));
require __DIR__ . '/TestCase.php';
require __DIR__ . '/bootstrap.php';

foreach (glob(__DIR__ . '/*Test.php') ?: [] as $file) {
    $before = TestCase::$failed;
    $run = require $file;
    $run();
    $name = basename($file, '.php');
    if (TestCase::$failed === $before) {
        echo "ok    $name\n";
    } else {
        echo "FAIL  $name\n";
    }
}

echo 'passed: ' . TestCase::$passed . '  failed: ' . TestCase::$failed . "\n";
exit(TestCase::$failed === 0 ? 0 : 1);
