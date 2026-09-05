pragma circom 2.1.6;

include "poseidon.circom";
include "comparators.circom";
include "binary-merkle-root.circom";
include "eddsaposeidon.circom";
include "lib/enabled_prefix.circom";
include "lib/attenuation.circom";
include "lib/warrant_hashes.circom";

// Full product circuit: LeanIMT membership + D padded mandate hops + request sig.
// Public inputs: same frozen 8-tuple as warrant_lean / Groth16 verifier.
template WarrantFull(D, MAX_DEPTH) {
    // —— public ——
    signal input merkleRoot;
    signal input contextHash;
    signal input nullifier;
    signal input effectiveScope;
    signal input effectiveBudgetCap;
    signal input minExpiry;
    signal input tier;
    signal input requestHash;

    // —— private: membership ——
    signal input rootPkX;
    signal input rootPkY;
    signal input epoch;
    signal input merkleDepth;
    signal input merkleIndex;
    signal input siblings[MAX_DEPTH];

    // —— private: mandate chain ——
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

    // Tag commitment binds humanTag into every signed mandate (closes quota rotation).
    component tagC = TagCommitment();
    tagC.humanTag <== humanTag;

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

    component mandateHash[D];
    component mandateSig[D];
    signal parentHash[D];
    parentHash[0] <== 0;

    for (var i = 0; i < D; i++) {
        if (i > 0) {
            parentHash[i] <== mandateHash[i - 1].out;
        }

        mandateHash[i] = WarrantMandateHash();
        mandateHash[i].childPkX <== childPkX[i];
        mandateHash[i].childPkY <== childPkY[i];
        mandateHash[i].scope <== scopes[i];
        mandateHash[i].budget <== budgets[i];
        mandateHash[i].expiry <== expiries[i];
        mandateHash[i].tier <== tier;
        mandateHash[i].epoch <== epoch;
        mandateHash[i].parentHash <== parentHash[i];
        mandateHash[i].tagCommitment <== tagC.out;

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

    component muxScope = EnabledMux(D);
    component muxBudget = EnabledMux(D);
    component muxExpiry = EnabledMux(D);
    component muxPkX = EnabledMux(D);
    component muxPkY = EnabledMux(D);
    for (var i = 0; i < D; i++) {
        muxScope.values[i] <== scopes[i];
        muxScope.enabled[i] <== enabled[i];
        muxBudget.values[i] <== budgets[i];
        muxBudget.enabled[i] <== enabled[i];
        muxExpiry.values[i] <== expiries[i];
        muxExpiry.enabled[i] <== enabled[i];
        muxPkX.values[i] <== childPkX[i];
        muxPkX.enabled[i] <== enabled[i];
        muxPkY.values[i] <== childPkY[i];
        muxPkY.enabled[i] <== enabled[i];
    }

    muxScope.out === effectiveScope;
    muxBudget.out === effectiveBudgetCap;

    component expiryOk = LessEqThan(64);
    expiryOk.in[0] <== minExpiry;
    expiryOk.in[1] <== muxExpiry.out;
    expiryOk.out === 1;

    component reqSig = EdDSAPoseidonVerifier();
    reqSig.enabled <== 1;
    reqSig.Ax <== muxPkX.out;
    reqSig.Ay <== muxPkY.out;
    reqSig.S <== reqS;
    reqSig.R8x <== reqR8x;
    reqSig.R8y <== reqR8y;
    reqSig.M <== requestHash;

    component nf = WarrantNullifier();
    nf.humanTag <== humanTag;
    nf.contextHash <== contextHash;
    nf.out === nullifier;
}

component main {
    public [
        merkleRoot, contextHash, nullifier, effectiveScope,
        effectiveBudgetCap, minExpiry, tier, requestHash
    ]
} = WarrantFull(4, 20);
