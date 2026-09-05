pragma circom 2.1.6;

include "comparators.circom";
include "scope_subset.circom";

// Scope always subset along the pad; budget/expiry only enforced when hop enabled.
template AttenuationChain(D) {
    signal input scopes[D];
    signal input budgets[D];
    signal input expiries[D];
    signal input enabled[D];

    component subsets[D];
    component budgetLe[D];
    component expiryLe[D];

    subsets[0] = ScopeSubset();
    subsets[0].parent <== scopes[0];
    subsets[0].child <== scopes[0];

    for (var i = 1; i < D; i++) {
        subsets[i] = ScopeSubset();
        subsets[i].parent <== scopes[i - 1];
        subsets[i].child <== scopes[i];

        budgetLe[i] = LessEqThan(64);
        budgetLe[i].in[0] <== budgets[i];
        budgetLe[i].in[1] <== budgets[i - 1];
        (1 - budgetLe[i].out) * enabled[i] === 0;

        expiryLe[i] = LessEqThan(64);
        expiryLe[i].in[0] <== expiries[i];
        expiryLe[i].in[1] <== expiries[i - 1];
        (1 - expiryLe[i].out) * enabled[i] === 0;
    }
}

// Last-enabled-hop mux (degree-2 split form — not quadratic (1-e)*a + e*b).
template EnabledMux(D) {
    signal input values[D];
    signal input enabled[D];
    signal output out;

    signal acc[D];
    acc[0] <== values[0];
    for (var i = 1; i < D; i++) {
        acc[i] <== acc[i - 1] + enabled[i] * (values[i] - acc[i - 1]);
    }
    out <== acc[D - 1];
}
