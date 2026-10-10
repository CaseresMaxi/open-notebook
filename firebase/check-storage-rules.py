import json
import urllib.error
import urllib.request

base = "http://127.0.0.1:9199/v0/b/demo-nextnootbook.appspot.com/o"
auth = urllib.request.Request(
    "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=emulator",
    data=json.dumps(
        {
            "email": "qa@example.invalid",
            "password": "test-password-123",
            "returnSecureToken": True,
        }
    ).encode(),
    headers={"Content-Type": "application/json"},
)
with urllib.request.urlopen(auth) as r:
    token = json.load(r)["idToken"]
for identity, headers in [
    ("anonymous", {}),
    ("authenticated", {"Authorization": "Bearer " + token}),
]:
    for name, req in [
        (
            "read",
            urllib.request.Request(
                base + "/private-test.txt?alt=media", headers=headers
            ),
        ),
        (
            "upload",
            urllib.request.Request(
                base + "?name=private-test.txt",
                data=b"private",
                headers={"Content-Type": "text/plain", **headers},
                method="POST",
            ),
        ),
    ]:
        try:
            urllib.request.urlopen(req)
            raise SystemExit("Unexpected storage access: " + identity + " " + name)
        except urllib.error.HTTPError as e:
            assert e.code == 403, (identity, name, e.code)
            print(identity, name, "denied")
print("Private storage rules verified")
