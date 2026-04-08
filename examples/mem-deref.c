// Null pointer dereference: writing through a null pointer.
// Check with property: Valid Dereferences
// Result: UNSAFE (valid-deref violated)

void main() {
  int *p = 0;
  *p = 42;
}
