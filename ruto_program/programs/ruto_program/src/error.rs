use anchor_lang::prelude::*;

#[error_code]
pub enum ErrorCode {
    #[msg("Only the protocol authority can create new profiles on chain ")]
    Unauthorized,
    #[msg("You didnt supply info for some fields!")]
    FieldsNotSupplied,
    #[msg("Counter has reached the maximum value")]
    CounterOverflow,
}
