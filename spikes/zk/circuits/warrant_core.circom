pragma circom 2.1.6;

include "poseidon.circom";
include "comparators.circom";
include "bitify.circom";

// Binary Merkle membership with Poseidon(2). Matches poseidon-lite poseidon2([l,r])
// when both children are present (LeanIMT's full-tree case).
template MerklePoseidon(nLevels) {
    signal input leaf;
    signal input pathElements[nLevels];
    signal input pathIndices[nLevels];
    signal output root;

    signal hashes[nLevels + 1];
    hashes[0] <== leaf;

    component hashers[nLevels];
    signal left[nLevels];
    signal right[nLevels];
    signal leftA[nLevels];
    signal leftB[nLevels];
    signal rightA[nLevels];
    signal rightB[nLevels];

    for (var i = 0; i < nLevels; i++) {
        pathIndices[i] * (pathIndices[i] - 1) === 0;
        // Split into one-mul signals: (1-idx)*cur + idx*sib is two products.
        leftA[i] <== (1 - pathIndices[i]) * hashes[i];
        leftB[i] <== pathIndices[i] * pathElements[i];
        left[i] <== leftA[i] + leftB[i];
        rightA[i] <== pathIndices[i] * hashes[i];
        rightB[i] <== (1 - pathIndices[i]) * pathElements[i];
        right[i] <== rightA[i] + rightB[i];
        hashers[i] = Poseidon(2);
        hashers[i].inputs[0] <== left[i];
        hashers[i].inputs[1] <== right[i];
        hashes[i + 1] <== hashers[i].out;
    }
    root <== hashes[nLevels];
}

// Scope subset: every set bit in child is also set in parent. 64-bit capability mask.
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

// Warrant core without EdDSA (measured separately): leaf membership, D-hop
// attenuation, request public inputs, nullifier = Poseidon(humanTag, context).
template WarrantCore(D, DEPTH) {
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
    signal input pathElements[DEPTH];
    signal input pathIndices[DEPTH];
    signal input scopes[D];
    signal input budgets[D];
    signal input expiries[D];
    signal input enabled[D]; // 1 for hops that exist, 0 for padding
    signal input humanTag;

    component leafHash = Poseidon(4);
    leafHash.inputs[0] <== rootPkX;
    leafHash.inputs[1] <== rootPkY;
    leafHash.inputs[2] <== tier;
    leafHash.inputs[3] <== epoch;

    component merkle = MerklePoseidon(DEPTH);
    merkle.leaf <== leafHash.out;
    for (var i = 0; i < DEPTH; i++) {
        merkle.pathElements[i] <== pathElements[i];
        merkle.pathIndices[i] <== pathIndices[i];
    }
    merkle.root === merkleRoot;

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
} = WarrantCore(4, 16);
