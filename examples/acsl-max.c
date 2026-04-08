// Maximum of two values with ACSL contract.
// TriCera verifies the postconditions and can infer contracts.
// Try enabling "Infer ACSL Annotations" in the options.
// Result: SAFE

/*@
  requires \valid(p) && \valid(q);
  ensures (\result == *p) || (\result == *q);
  ensures \result >= *p;
  ensures \result >= *q;
*/
int max(int *p, int *q) {
  if (*p >= *q) {
    return *p;
  } else {
    return *q;
  }
}
