// Q2: Factorial (0 <= n <= 12)
#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    int n;
    if (!(cin >> n)) {
        return 0;
    }
    long long fact = 1;
    for (int i = 2; i <= n; ++i) {
        fact *= i;
    }
    cout << fact << "\n";
    return 0;
}

