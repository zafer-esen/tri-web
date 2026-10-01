extern int __VERIFIER_nondet_int(void);

void reach_error() { assert(0); }

struct Node {int data; struct Node * next;};

#define WRITE_NODE(PTR, DATA, NEXT) do {    \
  struct Node n;                        \
  n.data = (DATA);                      \
  n.next = (NEXT);                      \
  *((PTR)) = n;                      \
} while(0)

int main() {
  int N = __VERIFIER_nondet_int();

  struct Node * head = malloc(sizeof(struct Node));
  struct Node * cur  = head;

  for (int i = 0; i < N; i++) {
    struct Node * next = malloc(sizeof(struct Node));
    WRITE_NODE(cur, 2, next);
    cur = next;
  }
  WRITE_NODE(cur, 3, 0);

  cur = head;
  while(cur != 0) {
    struct Node n = (*(cur));
    if(n.next != 0) {
      if(n.data != 2) reach_error();
    } else {
      if(n.data != 4) reach_error(); // should fail
    }
    cur = n.next;
  }
  return 0;
}
