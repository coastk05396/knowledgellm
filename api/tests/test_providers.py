from knowledgellm.providers import estimate_cost_usd


def test_cost_requires_both_current_rates_and_reports_an_estimate() -> None:
    assert estimate_cost_usd(1000, 500, 0.075, 0.3) == 0.000225
    assert estimate_cost_usd(1000, 500, None, 0.3) is None
