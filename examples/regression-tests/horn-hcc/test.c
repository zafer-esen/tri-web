// TRICERA-OPTIONS: -cex
int n = _;
int a[n];

int mex0() {
    for (int v = 0; v < n; v++) {    
        int i = 0;
        while (i < n && a[i] != v)
            i++;
        if (i == n)
            return v;
    }
    return n;
}

void main() {
    assume(n >= 0);
    int res = mex0();
    for (int i = 0; i < n; i++) {
        
    }
}