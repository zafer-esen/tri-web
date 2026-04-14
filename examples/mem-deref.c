// TRICERA-OPTIONS: -cex -valid-deref
// Null pointer dereference.

void main() {
  int *p = 0;
  *p = 42;
}
