#!/usr/bin/env python

from jsonrpc_requests import Server, ProtocolError


def manual():

    import requests
    import json

    url = "http://localhost:3000/RPC/foo"
    headers = {'content-type': 'application/json'}

    # Example echo method
    payload = {
        "method": "foo",
        "params": ["f"],
        "jsonrpc": "2.0",
        "id": 0,
    }
    response = requests.post(
        url, data = json.dumps(payload), headers=headers
    ).json()

    print response
    
def main():

    bionet = Server('http://localhost:3000/rpc')

    res = bionet.foo('foo')
    print "no stream: %s" % res

    res = bionet.bar()
    print "return stream: %s" % res

    res = bionet.baz('a')
    print "callback stream: %s" % res

    try:
        res = bionet.fail()
    except ProtocolError as err:
        print("got error: %s" % err.message)
        print("just the error message: %s" % err.server_data['error']['message'])

    try:
        res = bionet.secret()
    except ProtocolError as err:
        print("while calling .secret(): %s" % err.message)

    res = bionet.login('foo', 'bar')
    # note: your probably won't ever need to use this token manually
    print "logged in and got token: %s" % res 

    res = bionet.secret()
    print "secret: %s" % res

    try:
        res = bionet.admin_secret()
    except ProtocolError as err:
        print("while calling .admin_secret(): %s" % err.message)

if __name__ == "__main__":
    main()
