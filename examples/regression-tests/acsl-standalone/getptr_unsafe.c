// TRICERA-OPTIONS: -m:foo -cex -valid-deref
/*@
  ensures \result == *p;
*/
int foo(int* p) {
  return *p;
}
