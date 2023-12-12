from flask import Flask, render_template, request
from datetime import datetime

app = Flask(__name__)

current_peers = []

@app.route("/")
def homepage():
    return render_template("main.html")

@app.route("/api/post_peer_id",methods=['POST'])
def post_peer_id():
    assert request.method == 'POST' and 'pid' in request.form
    new_pid = request.form['pid']
    # TODO: on update of current_peers, probably pruning should happen
    current_peers.append( tuple((new_pid,datetime.now())) )
    return {'success':True}

@app.route("/api/get_group")
def get_group():
    # TODO: prune current peers?
    return {
        'success':True,
        'peer_ids':[ peer[0] for peer in current_peers ]
        }

if __name__ == "__main__":
    print("in your browser, open the url localhost:5000")
    app.run(debug=True)
