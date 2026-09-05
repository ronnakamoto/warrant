pragma circom 2.1.5;

include "binary-merkle-root.circom";

// Audited Semaphore v4 membership (BinaryMerkleRoot 2.x, single index + Num2Bits).
// MAX_DEPTH is a compile-time cap; `depth` is the LeanIMT's actual depth.
template LeanIMTCheck(MAX_DEPTH) {
    signal input leaf;
    signal input depth;
    signal input index;
    signal input siblings[MAX_DEPTH];
    signal input expectedRoot;

    component merkle = BinaryMerkleRoot(MAX_DEPTH);
    merkle.leaf <== leaf;
    merkle.depth <== depth;
    merkle.index <== index;
    for (var i = 0; i < MAX_DEPTH; i++) {
        merkle.siblings[i] <== siblings[i];
    }
    merkle.out === expectedRoot;
}

component main {
    public [expectedRoot]
} = LeanIMTCheck(20);
