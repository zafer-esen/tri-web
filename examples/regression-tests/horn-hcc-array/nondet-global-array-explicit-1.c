// TRICERA-OPTIONS: -cex
int a[5] = _;

void main() {
    // Should be UNSAFE
    assert(a[0] == 0);
}
