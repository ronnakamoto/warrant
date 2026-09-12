pragma circom 2.1.6;

include "poseidon.circom";
include "comparators.circom";
include "binary-merkle-root.circom";
include "eddsaposeidon.circom";
include "lib/attenuation.circom";
include "lib/warrant_hashes.circom";

// Incremental hop: identity leaf + two always-on mandate slots in one forest.
// Public inputs: same frozen 8-tuple as WarrantFull / Groth16 verifier.
template WarrantHop(MAX_DEPTH) {
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

    // —— private: two-slot mandate chain ——
    signal input parentParentHash;
    signal input parentAx;
    signal input parentAy;
    signal input scopes[2];
    signal input budgets[2];
    signal input expiries[2];
    signal input humanTag;
    signal input childPkX[2];
    signal input childPkY[2];
    signal input sigS[2];
    signal input sigR8x[2];
    signal input sigR8y[2];
    signal input reqS;
    signal input reqR8x;
    signal input reqR8y;
    signal input hopIndex[2];
    signal input hopDepth[2];
    signal input hopSiblings[2][MAX_DEPTH];

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

    // parentParentHash == 0 → root signs the parent slot; else parentAx/Ay.
    component parentIsRoot = IsZero();
    parentIsRoot.in <== parentParentHash;
    signal parentSignerAx;
    signal parentSignerAy;
    parentSignerAx <== parentAx + parentIsRoot.out * (rootPkX - parentAx);
    parentSignerAy <== parentAy + parentIsRoot.out * (rootPkY - parentAy);

    component mandateHash[2];
    component mandateSig[2];

    for (var i = 0; i < 2; i++) {
        mandateHash[i] = WarrantMandateHash();
        mandateHash[i].childPkX <== childPkX[i];
        mandateHash[i].childPkY <== childPkY[i];
        mandateHash[i].scope <== scopes[i];
        mandateHash[i].budget <== budgets[i];
        mandateHash[i].expiry <== expiries[i];
        mandateHash[i].tier <== tier;
        mandateHash[i].epoch <== epoch;
        if (i == 0) {
            mandateHash[i].parentHash <== parentParentHash;
        } else {
            mandateHash[i].parentHash <== mandateHash[0].out;
        }
        mandateHash[i].tagCommitment <== tagC.out;

        mandateSig[i] = EdDSAPoseidonVerifier();
        mandateSig[i].enabled <== 1;
        if (i == 0) {
            mandateSig[i].Ax <== parentSignerAx;
            mandateSig[i].Ay <== parentSignerAy;
        } else {
            mandateSig[i].Ax <== childPkX[0];
            mandateSig[i].Ay <== childPkY[0];
        }
        mandateSig[i].S <== sigS[i];
        mandateSig[i].R8x <== sigR8x[i];
        mandateSig[i].R8y <== sigR8y[i];
        mandateSig[i].M <== mandateHash[i].out;
    }

    component hopMerkle[2];
    for (var i = 0; i < 2; i++) {
        hopMerkle[i] = BinaryMerkleRoot(MAX_DEPTH);
        hopMerkle[i].leaf <== mandateHash[i].out;
        hopMerkle[i].depth <== hopDepth[i];
        hopMerkle[i].index <== hopIndex[i];
        for (var j = 0; j < MAX_DEPTH; j++) {
            hopMerkle[i].siblings[j] <== hopSiblings[i][j];
        }
        hopMerkle[i].out === merkleRoot;
    }

    component atten = AttenuationChain(2);
    for (var i = 0; i < 2; i++) {
        atten.scopes[i] <== scopes[i];
        atten.budgets[i] <== budgets[i];
        atten.expiries[i] <== expiries[i];
        atten.enabled[i] <== 1;
    }

    scopes[1] === effectiveScope;
    budgets[1] === effectiveBudgetCap;

    component expiryOk = LessEqThan(64);
    expiryOk.in[0] <== minExpiry;
    expiryOk.in[1] <== expiries[1];
    expiryOk.out === 1;

    component reqSig = EdDSAPoseidonVerifier();
    reqSig.enabled <== 1;
    reqSig.Ax <== childPkX[1];
    reqSig.Ay <== childPkY[1];
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
} = WarrantHop(20);
