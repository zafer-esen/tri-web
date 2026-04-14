// TRICERA-OPTIONS: -m:foo -cex -acsl
// Maximum of two values with an ACSL contract. The entry function is
// named "foo" to match -m:foo.

/*@
  requires \valid(p) && \valid(q);
  ensures (\result == *p) || (\result == *q);
  ensures \result >= *p;
  ensures \result >= *q;
*/
int foo(int *p, int *q) {
  if (*p >= *q) {
    return *p;
  } else {
    return *q;
  }
}
