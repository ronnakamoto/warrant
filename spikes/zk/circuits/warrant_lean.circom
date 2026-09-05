pragma circom 2.1.5;

include "poseidon.circom";
include "comparators.circom";
include "bitify.circom";
include "binary-merkle-root.circom";

// Same attenuation as warrant_core, but membership is Semaphore's LeanIMT
// verifier (BinaryMerkleRoot) instead of a full-binary zero-padded tree.
template ScopeSubset() {
    signal input parent;
    signal input child;
    component pBits = Num2Bits(64);
    component cBits = Num2Bits(64);
    pBits.in <== parent;
    cBits.in <== child;
    for (var i = 0; i < 64; i++) {
        cBits.out[i] * (1 - pBits.out[i]) === 0;
    }
}

template WarrantLean(D, MAX_DEPTH) {
    signal input merkleRoot;
    signal input contextHash;
    signal input nullifier;
    signal input effectiveScope;
    signal input effectiveBudgetCap;
    signal input minExpiry;
    signal input tier;
    signal input requestHash;

    signal input rootPkX;
    signal input rootPkY;
    signal input epoch;
    signal input merkleDepth;
    signal input merkleIndex;
    signal input siblings[MAX_DEPTH];
    signal input scopes[D];
    signal input budgets[D];
    signal input expiries[D];
    signal input enabled[D];
    signal input humanTag;

    component leafHash = Poseidon(4);
    leafHash.inputs[0] <== rootPkX;
    leafHash.inputs[1] <== rootPkY;
    leafHash.inputs[2] <== tier;
    leafHash.inputs[3] <== epoch;

    component merkle = BinaryMerkleRoot(MAX_DEPTH);
    merkle.leaf <== leafHash.out;
    merkle.depth <== merkleDepth;
    merkle.index <== merkleIndex;
    for (var i = 0; i < MAX_DEPTH; i++) {
        merkle.siblings[i] <== siblings[i];
    }
    merkle.out === merkleRoot;

    component subsets[D];
    component budgetLe[D];
    component expiryLe[D];

    for (var i = 0; i < D; i++) {
        enabled[i] * (enabled[i] - 1) === 0;
        if (i == 0) {
            enabled[0] === 1;
        } else {
            (1 - enabled[i - 1]) * enabled[i] === 0;
        }
    }

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

    signal accScope[D];
    signal accBudget[D];
    signal accExpiry[D];
    accScope[0] <== scopes[0];
    accBudget[0] <== budgets[0];
    accExpiry[0] <== expiries[0];
    for (var i = 1; i < D; i++) {
        accScope[i] <== accScope[i - 1] + enabled[i] * (scopes[i] - accScope[i - 1]);
        accBudget[i] <== accBudget[i - 1] + enabled[i] * (budgets[i] - accBudget[i - 1]);
        accExpiry[i] <== accExpiry[i - 1] + enabled[i] * (expiries[i] - accExpiry[i - 1]);
    }

    accScope[D - 1] === effectiveScope;
    accBudget[D - 1] === effectiveBudgetCap;

    component expiryOk = LessEqThan(64);
    expiryOk.in[0] <== minExpiry;
    expiryOk.in[1] <== accExpiry[D - 1];
    expiryOk.out === 1;

    component nf = Poseidon(2);
    nf.inputs[0] <== humanTag;
    nf.inputs[1] <== contextHash;
    nf.out === nullifier;

    signal requestBound <== requestHash * requestHash;
}

component main {
    public [
        merkleRoot, contextHash, nullifier, effectiveScope,
        effectiveBudgetCap, minExpiry, tier, requestHash
    ]
} = WarrantLean(4, 20);
