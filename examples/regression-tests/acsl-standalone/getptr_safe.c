// TRICERA-OPTIONS: -m:foo -cex -memsafety -arithMode:ilp32
/*@
  requires \valid(p);
  ensures \result == *p;
*/
int foo(int* p) {
  return *p;
}
