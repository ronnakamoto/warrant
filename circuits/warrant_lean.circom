pragma circom 2.1.6;

include "comparators.circom";
include "binary-merkle-root.circom";
include "lib/enabled_prefix.circom";
include "lib/attenuation.circom";
include "lib/warrant_hashes.circom";

// LeanIMT membership + D-hop attenuation. No EdDSA (WP1).
// Hash helpers share domain tags with the full product circuit.
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

    component leafHash = WarrantLeafHash();
    leafHash.pkX <== rootPkX;
    leafHash.pkY <== rootPkY;
    leafHash.tier <== tier;
    leafHash.epoch <== epoch;

    component merkle = BinaryMerkleRoot(MAX_DEPTH);
    merkle.leaf <== leafHash.out;
    merkle.depth <== merkleDepth;
    merkle.index <== merkleIndex;
    for (var i = 0; i < MAX_DEPTH; i++) {
        merkle.siblings[i] <== siblings[i];
    }
    merkle.out === merkleRoot;

    component enabledGate = EnabledPrefix(D);
    for (var i = 0; i < D; i++) {
        enabledGate.enabled[i] <== enabled[i];
    }

    component atten = AttenuationChain(D);
    for (var i = 0; i < D; i++) {
        atten.scopes[i] <== scopes[i];
        atten.budgets[i] <== budgets[i];
        atten.expiries[i] <== expiries[i];
        atten.enabled[i] <== enabled[i];
    }

    component muxScope = EnabledMux(D);
    component muxBudget = EnabledMux(D);
    component muxExpiry = EnabledMux(D);
    for (var i = 0; i < D; i++) {
        muxScope.values[i] <== scopes[i];
        muxScope.enabled[i] <== enabled[i];
        muxBudget.values[i] <== budgets[i];
        muxBudget.enabled[i] <== enabled[i];
        muxExpiry.values[i] <== expiries[i];
        muxExpiry.enabled[i] <== enabled[i];
    }

    muxScope.out === effectiveScope;
    muxBudget.out === effectiveBudgetCap;

    component expiryOk = LessEqThan(64);
    expiryOk.in[0] <== minExpiry;
    expiryOk.in[1] <== muxExpiry.out;
    expiryOk.out === 1;

    component nf = WarrantNullifier();
    nf.humanTag <== humanTag;
    nf.contextHash <== contextHash;
    nf.out === nullifier;

    // Bind requestHash until WP2 EdDSA (lean only).
    signal requestBound <== requestHash * requestHash;
}

component main {
    public [
        merkleRoot, contextHash, nullifier, effectiveScope,
        effectiveBudgetCap, minExpiry, tier, requestHash
    ]
} = WarrantLean(4, 20);
