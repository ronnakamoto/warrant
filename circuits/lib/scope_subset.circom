pragma circom 2.1.6;

include "bitify.circom";

// Child uint64 capability bits must be a subset of parent.
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
