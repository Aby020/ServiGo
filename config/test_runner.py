"""
Test runner for ServiGo.

The default cache is not isolated per test. Django's runner gives every test a
fresh database but leaves the cache exactly as the previous test left it, and
both rate limiters in this project count in that cache: DRF's
``AnonRateThrottle`` / ``UserRateThrottle`` for the API, and the hand-rolled
fixed-window counters in ``accounts.views`` for the HTML forms.

Every test client shares one IP (``127.0.0.1``), so the anonymous budget is one
shared pool for the whole suite. Left alone, a module of ~21 API registration
tests exhausts the 20/minute anon budget part-way through and the remaining
tests fail with a 429 that depends on where in the run they fall and on how
quickly the suite executes — the worst kind of test failure, because it is
neither reproducible nor about the thing it appears to be testing.

Clearing the cache before each test keeps the throttles enforced *and* keeps
them from leaking across test boundaries. A test that wants to assert a limiter
fires makes its repeated requests inside a single test, so it still sees
exactly the behaviour it is checking.
"""
from django.core.cache import cache
from django.test.runner import DiscoverRunner
from django.test.testcases import TransactionTestCase


class ServiGoTestRunner(DiscoverRunner):
    """`DiscoverRunner` with the default cache reset between tests."""

    def run_suite(self, suite, **kwargs):
        kwargs = self.get_test_runner_kwargs()
        runner = self.test_runner(**kwargs)

        # `TransactionTestCase.__call__` runs `_setup_and_call`, which wraps
        # every individual test. That is the only per-test seam in the chain:
        # `unittest.TestSuite.run` just calls `test(result)`, and Django's
        # `DiscoverRunner` passes the stdlib `TextTestRunner` straight through,
        # so neither of them is a place a hook can live. `TestCase` inherits it
        # from `TransactionTestCase`, which is why patching the base class
        # covers every Django test case.
        original = TransactionTestCase._setup_and_call

        def setup_and_call_with_cache_reset(self, result, debug=False):
            cache.clear()
            return original(self, result, debug)

        TransactionTestCase._setup_and_call = setup_and_call_with_cache_reset
        try:
            return runner.run(suite)
        finally:
            TransactionTestCase._setup_and_call = original