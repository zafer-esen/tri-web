extern int __VERIFIER_nondet_int(void);

void reach_error() { assert(0); }
int main() {
  int N = __VERIFIER_nondet_int();

  int * p = malloc(sizeof(int));
  *(p) = 42;
  int t = (*(p));
  if(t != -1) reach_error();

  return 0;
}
