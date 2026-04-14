// TRICERA-OPTIONS: -m:foo -cex
/*@
  requires x >= 0;
  ensures \result >= 1;
*/
int foo(int x) {
  return x+1;
}
