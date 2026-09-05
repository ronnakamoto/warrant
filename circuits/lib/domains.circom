pragma circom 2.1.6;

// Domain tags = big-endian UTF-8 of the ASCII domain string as a field element.
// Keep in lockstep with circuits/test/lib/hashes.mjs.

function DOMAIN_LEAF() {
    return 36946522432971230366786740582; // warrant/leaf
}

function DOMAIN_MANDATE() {
    return 619859787306803853649617505417786469; // warrant/mandate
}

function DOMAIN_NULLIFIER() {
    return 40623131020938697352801220176894786889074; // warrant/nullifier
}

function DOMAIN_TAG() {
    return 144322353253793868620783975; // warrant/tag
}
