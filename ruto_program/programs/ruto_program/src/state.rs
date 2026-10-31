use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct Config {
    pub bumb: u8,
    pub authority: Pubkey,
}

#[account]
#[derive(InitSpace)]
pub struct Profile {
    #[max_len(20)]
    pub handle: String,
    pub avatar_id: u8,
    pub data_hash: [u8; 32],
    pub inbox_count: u32,
    pub sent_count: u32,
    pub created_at: i64,
    pub bumb: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Card {
    pub sender: Pubkey,
    pub recipient: Pubkey,
    pub kind: CardKind,
    pub route_hash: [u8; 32],
    pub shared_profile: Pubkey,
    pub status: CardStatus,
    pub index: u32,
    pub created_at: i64,
    pub resolved_at: i64,
    pub bump: u8,
}

#[derive(InitSpace, Clone, AnchorDeserialize, AnchorSerialize)]
#[borsh(use_discriminant = true)]
pub enum CardKind {
    Route = 0,
    Profile = 1,
}

#[derive(InitSpace, Clone, AnchorDeserialize, AnchorSerialize)]
#[borsh(use_discriminant = true)]
pub enum CardStatus {
    Pending = 0,
    Accepted = 1,
    Declined = 2,
}
