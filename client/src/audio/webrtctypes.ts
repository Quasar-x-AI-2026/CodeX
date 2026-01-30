


export type Role = "teacher" | "student";


export type SdpType = "offer" | "answer";


export type Offer = {
  type: "sdp";
  sdpType: "offer";
  sdp: RTCSessionDescriptionInit;
  
  recipient?: "teacher" | "students" | "all";
  targetSocketId?: string;
};


export type Answer = {
  type: "sdp";
  sdpType: "answer";
  sdp: RTCSessionDescriptionInit;
  recipient?: "teacher" | "students" | "all";
  targetSocketId?: string;
};


export type IceCandidateMessage = {
  type: "ice";
  candidate: RTCIceCandidateInit;
  recipient?: "teacher" | "students" | "all";
  targetSocketId?: string;
};


export type SignalingMessage = Offer | Answer | IceCandidateMessage;
