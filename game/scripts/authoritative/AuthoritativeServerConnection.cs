using System.Text;
using Godot;
using Godot.Collections;

public partial class AuthoritativeServerConnection : Node {
    public static AuthoritativeServerConnection Instance { get; private set; }

    public Dictionary<string, bool> EnforcedState { get; private set; } = new();

    private WebSocketPeer _socket;

    private string _accessToken;
    private string _refreshToken;

    public override void _Ready() {
        if (Instance != null) {
            GD.PrintErr("AuthoritativeServerConnection instance already exists. Destroying duplicate.");
            QueueFree();
            return;
        }

        Instance = this;

        var httpNode = new HttpRequest();
        AddChild(httpNode);

        httpNode.RequestCompleted += OnRequestCompleted;

        var postBody = new Dictionary();

        postBody.Add("username", "floffah");
        postBody.Add("password", "password");

        httpNode.Request("http://localhost:3000/v1/user/auth", new string[] {
            "Content-Type: application/json",
        }, HttpClient.Method.Post, Json.Stringify(postBody));
    }

    private void OnRequestCompleted(long result, long responseCode, string[] headers, byte[] body) {
        var json = Json.ParseString(Encoding.UTF8.GetString(body)).AsGodotDictionary();

        if (responseCode == 200) {
            GD.Print("Authentication successful. Response: ", json);
            _accessToken = json["accessToken"].AsString();
            _refreshToken = json["refreshToken"].AsString();

            Connect();
        } else {
            GD.PrintErr("Authentication failed. Response code: ", responseCode, ", Body: ",
                Encoding.UTF8.GetString(body));
        }
    }

    private void Reset() {
        if (_socket != null) {
            _socket.Close();
            _socket = null;
        }

        _accessToken = null;
        _refreshToken = null;

        SetProcess(false);
    }

    private void Connect() {
        GD.Print("Starting authoritative server connection...");
        _socket = new WebSocketPeer();

        _socket.SetHeartbeatInterval(5);
        _socket.SetHandshakeHeaders(new[] {
            "Device: EchoformMMOGame, Godot 4.4.1",
            "Authorization: Bearer " + _accessToken
        });
        var error = _socket.ConnectToUrl("ws://localhost:3000/client");

        if (error != Error.Ok) {
            Reset();

            GD.PrintErr("Failed to connect to authoritative server: ", error);
            return;
        } else {
            SetProcess(true);
        }
    }

    public override void _Process(double delta) {
        if (_socket == null) {
            return;
        }

        _socket.Poll();

        var state = _socket.GetReadyState();

        if (state == WebSocketPeer.State.Open) {
            while (_socket.GetAvailablePacketCount() > 0) {
                var packet = _socket.GetPacket();
                if (packet is byte[] data) {
                    var message = System.Text.Encoding.UTF8.GetString(data);
                    GD.Print("Received message: ", message);

                    var parsedPacket = PacketTranslator.GetFromString(message);

                    if (parsedPacket is ClientboundPacket clientboundPacket) {
                        clientboundPacket.Handle();
                        GD.Print("Handled packet: ", clientboundPacket.Id);
                    } else {
                        GD.PrintErr("Received unknown packet type: ", parsedPacket?.GetType());
                    }
                } else {
                    GD.PrintErr("Received non-byte packet: ", packet);
                }
            }
        } else if (state == WebSocketPeer.State.Closing) {
            GD.Print("WebSocket is closing.");
        } else if (state == WebSocketPeer.State.Closed) {
            GD.Print("WebSocket is closed.", _socket.GetPacketError());

            Reset();
        } else {
            GD.Print("WebSocket state: ", state);
        }
    }

    public void SendPacket(ServerboundPacket packet) {
        if (_socket == null || _socket.GetReadyState() != WebSocketPeer.State.Open) {
            GD.PrintErr("Cannot send packet, WebSocket is not open.");
            return;
        }

        var serializedPacketData = packet.Serialize();
        var serializedPacket = new Godot.Collections.Dictionary {
            ["id"] = packet.Id,
            ["data"] = serializedPacketData
        };

        var jsonString = Json.Stringify(serializedPacket);

        _socket.SendText(jsonString);
        GD.Print("Sent packet: ", jsonString);
    }

    public void SendReady() {
        SendPacket(new ClientReadyPacket());
    }
}