// TRICERA-OPTIONS: -m:foo -cex -memsafety
/*@
  requires \valid(p);
  ensures \result == *p;
*/
int foo(int* p) {
  return *p;
}
