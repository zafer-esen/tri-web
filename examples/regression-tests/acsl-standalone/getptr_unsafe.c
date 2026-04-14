// TRICERA-OPTIONS: -m:foo -cex -valid-deref -arithMode:ilp32
/*@
  ensures \result == *p;
*/
int foo(int* p) {
  return *p;
}
