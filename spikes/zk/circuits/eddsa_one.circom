pragma circom 2.1.6;

include "eddsaposeidon.circom";

template EdDSACount() {
    signal input enabled;
    signal input Ax;
    signal input Ay;
    signal input S;
    signal input R8x;
    signal input R8y;
    signal input M;

    component v = EdDSAPoseidonVerifier();
    v.enabled <== enabled;
    v.Ax <== Ax;
    v.Ay <== Ay;
    v.S <== S;
    v.R8x <== R8x;
    v.R8y <== R8y;
    v.M <== M;
}

component main = EdDSACount();
