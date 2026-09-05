pragma circom 2.1.6;

// enabled[i] ∈ {0,1}; hop 0 on; once off, stay off. Allows [1,1,0,0]-style padding.
template EnabledPrefix(D) {
    signal input enabled[D];
    for (var i = 0; i < D; i++) {
        enabled[i] * (enabled[i] - 1) === 0;
        if (i == 0) {
            enabled[0] === 1;
        } else {
            (1 - enabled[i - 1]) * enabled[i] === 0;
        }
    }
}
