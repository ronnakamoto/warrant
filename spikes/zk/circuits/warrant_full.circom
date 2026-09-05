pragma circom 2.1.5;

include "poseidon.circom";
include "comparators.circom";
include "bitify.circom";
include "binary-merkle-root.circom";
include "eddsaposeidon.circom";

// Full hackathon circuit: LeanIMT membership + 4 padded mandate hops + request sig.
// Public inputs stay the same 8 as warrant_lean / the Groth16 verifier.
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

template WarrantFull(D, MAX_DEPTH) {
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

    signal input childPkX[D];
    signal input childPkY[D];
    signal input sigS[D];
    signal input sigR8x[D];
    signal input sigR8y[D];
    signal input reqS;
    signal input reqR8x;
    signal input reqR8y;

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
    component mandateHash[D];
    component mandateSig[D];

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

    for (var i = 0; i < D; i++) {
        mandateHash[i] = Poseidon(5);
        mandateHash[i].inputs[0] <== childPkX[i];
        mandateHash[i].inputs[1] <== childPkY[i];
        mandateHash[i].inputs[2] <== scopes[i];
        mandateHash[i].inputs[3] <== budgets[i];
        mandateHash[i].inputs[4] <== expiries[i];

        mandateSig[i] = EdDSAPoseidonVerifier();
        mandateSig[i].enabled <== enabled[i];
        if (i == 0) {
            mandateSig[i].Ax <== rootPkX;
            mandateSig[i].Ay <== rootPkY;
        } else {
            mandateSig[i].Ax <== childPkX[i - 1];
            mandateSig[i].Ay <== childPkY[i - 1];
        }
        mandateSig[i].S <== sigS[i];
        mandateSig[i].R8x <== sigR8x[i];
        mandateSig[i].R8y <== sigR8y[i];
        mandateSig[i].M <== mandateHash[i].out;
    }

    signal accScope[D];
    signal accBudget[D];
    signal accExpiry[D];
    signal accPkX[D];
    signal accPkY[D];
    accScope[0] <== scopes[0];
    accBudget[0] <== budgets[0];
    accExpiry[0] <== expiries[0];
    accPkX[0] <== childPkX[0];
    accPkY[0] <== childPkY[0];
    for (var i = 1; i < D; i++) {
        accScope[i] <== accScope[i - 1] + enabled[i] * (scopes[i] - accScope[i - 1]);
        accBudget[i] <== accBudget[i - 1] + enabled[i] * (budgets[i] - accBudget[i - 1]);
        accExpiry[i] <== accExpiry[i - 1] + enabled[i] * (expiries[i] - accExpiry[i - 1]);
        accPkX[i] <== accPkX[i - 1] + enabled[i] * (childPkX[i] - accPkX[i - 1]);
        accPkY[i] <== accPkY[i - 1] + enabled[i] * (childPkY[i] - accPkY[i - 1]);
    }

    accScope[D - 1] === effectiveScope;
    accBudget[D - 1] === effectiveBudgetCap;

    component expiryOk = LessEqThan(64);
    expiryOk.in[0] <== minExpiry;
    expiryOk.in[1] <== accExpiry[D - 1];
    expiryOk.out === 1;

    component reqSig = EdDSAPoseidonVerifier();
    reqSig.enabled <== 1;
    reqSig.Ax <== accPkX[D - 1];
    reqSig.Ay <== accPkY[D - 1];
    reqSig.S <== reqS;
    reqSig.R8x <== reqR8x;
    reqSig.R8y <== reqR8y;
    reqSig.M <== requestHash;

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
} = WarrantFull(4, 20);
