pragma circom 2.1.6;

include "poseidon.circom";
include "domains.circom";

template TagCommitment() {
    signal input humanTag;
    signal output out;
    component h = Poseidon(2);
    h.inputs[0] <== DOMAIN_TAG();
    h.inputs[1] <== humanTag;
    out <== h.out;
}

template WarrantLeafHash() {
    signal input pkX;
    signal input pkY;
    signal input tier;
    signal input epoch;
    signal output out;
    component h = Poseidon(5);
    h.inputs[0] <== DOMAIN_LEAF();
    h.inputs[1] <== pkX;
    h.inputs[2] <== pkY;
    h.inputs[3] <== tier;
    h.inputs[4] <== epoch;
    out <== h.out;
}

template WarrantNullifier() {
    signal input humanTag;
    signal input contextHash;
    signal output out;
    component h = Poseidon(3);
    h.inputs[0] <== DOMAIN_NULLIFIER();
    h.inputs[1] <== humanTag;
    h.inputs[2] <== contextHash;
    out <== h.out;
}

// Signed mandate message: binds child, capabilities, leaf epoch/tier, chain link, tag.
template WarrantMandateHash() {
    signal input childPkX;
    signal input childPkY;
    signal input scope;
    signal input budget;
    signal input expiry;
    signal input tier;
    signal input epoch;
    signal input parentHash;
    signal input tagCommitment;
    signal output out;
    component h = Poseidon(10);
    h.inputs[0] <== DOMAIN_MANDATE();
    h.inputs[1] <== childPkX;
    h.inputs[2] <== childPkY;
    h.inputs[3] <== scope;
    h.inputs[4] <== budget;
    h.inputs[5] <== expiry;
    h.inputs[6] <== tier;
    h.inputs[7] <== epoch;
    h.inputs[8] <== parentHash;
    h.inputs[9] <== tagCommitment;
    out <== h.out;
}
