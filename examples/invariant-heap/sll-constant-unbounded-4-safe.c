extern int __VERIFIER_nondet_int(void);

void reach_error() { assert(0); }
struct node { int h; struct node * n; };

#define WRITE_NODE(PTR, H, N) do {    \
  struct node tmp;                  \
  tmp.h = (H);                      \
  tmp.n = (N);                      \
  *((PTR)) = tmp;                \
} while(0)

int main() {
  int K = __VERIFIER_nondet_int();

  struct node * a = malloc(sizeof(struct node));
  struct node * c = a;
  WRITE_NODE(a, 42, 0);

  for (int i = 0; i < K; i++) {
    int x = __VERIFIER_nondet_int();
    if (x <= 100) { while(1) {} } // assume(x > 100);
    struct node * b = malloc(sizeof(struct node));
    WRITE_NODE(b, x, a);
    a = b;
  }

  if((*(a)).h <= 10) reach_error();
  if((*(c)).h <= 10) reach_error();

  struct node * b = a;
  while(b != 0) {
    struct node tmp = (*(b));
    if(tmp.h <= 10) reach_error();
    b = tmp.n;
  }

  return 0;
}
